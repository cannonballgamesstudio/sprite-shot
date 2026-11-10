import * as BABYLON from '@babylonjs/core';

/**
 * rootsMaterial — a cartoony cel VINE/ROOT climb for the spherical sprite rig, the
 * `rooted` status-visual subject: green vines/roots
 * climbing the legs from the tile and pinning the fighter. Shaded on the shared tapering CONE
 * (loadShaderEffect's `geometry: 'cone'` seam, same as flame/frost), placed LOW + translucent
 * in-game so the vines wrap the lower body and the model stays clearly visible above.
 *
 * Design converged from a 3-way design-judge panel (strand-carve winner + grafts). The read is
 * built ENTIRELY from the object-space azimuth angle atan(vLocalPos.z, vLocalPos.x), NOT from noise
 * blobs — which is what keeps it from baking to a featureless orb:
 *  - The circumference is sliced into STRANDS (5) twisted rope cells; only the central band of each
 *    cell (half-width VW) survives the alpha carve, so there are GUARANTEED angular GAPS between the
 *    ropes at every height and the leg reads through. TWIST*vYf spirals each rope as it climbs.
 *  - Per-strand wander / woody knobs / staggered topEnd fades make the ropes ragged and organic, so
 *    the tips peter out instead of converging into a party-hat blob. A sparse secondary TENDRILS set
 *    adds mid-shin offshoots, and hash-gated bright-chartreuse LEAF specks cluster on the tips.
 *  - The VERTEX also recomputes the same lane and bulges the 5 rib centers outward along the normal,
 *    so the CONE SILHOUETTE is physically lobed into 5 ridges (not merely alpha-carved).
 *
 * SEAM SAFETY: every per-strand term is keyed on mod(sID, STRANDS) / mod(tID, TENDRILS), identical
 * on both sides of the atan +/-pi cut, so ropes never tear at the back seam on any bake camera.
 * Cross-angle dimensionality comes from the shipped recipe: a FIXED world-space KEY_DIR lights the
 * cone (subject never rotates, only the rig orbits) + object-space sampling so a different rope
 * patch faces each of the 8 azimuth cameras. halfHeight MUST equal loadShaderEffect's cone
 * height/2 (FLAME_H/2) or the base->tip taper / tip fades / leaf band land at the wrong Y.
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

// Shared consts + hash keyed by both stages. No inline comments inside GLSL (Babylon splits the
// source on ';' before stripping '//', so a ';' in a comment would corrupt the shader).
const ROOTS_GLSL = `
  const float STRANDS = 5.0;
  const float TENDRILS = 4.0;
  const float TWIST = 2.3;
  const float VW = 0.215;
  const float TAU = 6.28318530718;

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

  BABYLON.Effect.ShadersStore['rootsEffectVertexShader'] = `
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
    ${ROOTS_GLSL}

    void main(void){
      vec3 p = position;
      float yf = clamp(position.y / (2.0 * halfHeight) + 0.5, 0.0, 1.0);

      float ang = atan(position.z, position.x);
      float twist = TWIST * yf;
      float u = (ang + twist) / TAU;
      u = u - floor(u);
      float sPos = u * STRANDS;
      float rib = 1.0 - abs(fract(sPos) - 0.5) * 2.0;
      rib = smoothstep(0.20, 1.0, rib);

      vec3 np = position * noiseScale + vec3(seed, yf * 2.0 + time * 0.12, seed * 1.7);
      float bump = snoise(np) * 0.7 + snoise(np * 2.3 + 11.0) * 0.3;

      float taper = 0.92 - 0.55 * yf;
      float bulge = rib * displacement * taper + bump * displacement * 0.25;
      p += normal * bulge;

      float swayAmp = 0.05 * yf * yf;
      p.x += snoise(vec3(seed * 4.0, yf * 1.6 + time * 0.25, 3.0)) * swayAmp;
      p.z += snoise(vec3(seed * 4.0 + 9.0, yf * 1.6 + time * 0.25, 8.0)) * swayAmp;

      vLocalPos = p;
      vYf = yf;
      vec4 wp = world * vec4(p, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      gl_Position = viewProjection * wp;
    }
  `;

  BABYLON.Effect.ShadersStore['rootsEffectFragmentShader'] = `
    precision highp float;

    varying vec3 vLocalPos;
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying float vYf;

    uniform vec3 cameraPosition;
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
    ${ROOTS_GLSL}

    const vec3 KEY_DIR = normalize(vec3(0.50, 0.36, 0.79));

    void main(void){
      float ang = atan(vLocalPos.z, vLocalPos.x);
      float twist = TWIST * vYf;
      float u = (ang + twist) / TAU;
      u = u - floor(u);

      float sPos = u * STRANDS;
      float sID = floor(sPos);
      float sFrac = sPos - sID;
      float sKey = mod(sID, STRANDS);

      float wander = snoise(vec3(sKey * 3.7 + seed, vYf * 2.1, 0.5)) * 0.16;
      float centered = (sFrac - 0.5) + wander;

      float taper = mix(1.15, 0.40, vYf);
      float knobs = 0.80 + 0.35 * snoise(vec3(sKey * 5.1 + seed, vYf * 6.0, 2.0));
      float hw = VW * taper * knobs;
      float topEnd = mix(0.70, 1.0, hash11(sKey + 21.0));
      float tipFade = 1.0 - smoothstep(topEnd - 0.16, topEnd, vYf);

      float ad = abs(centered);
      float strand = (1.0 - smoothstep(hw - 0.045, hw + 0.045, ad)) * tipFade;

      float u2 = (ang - TWIST * 1.6 * vYf) / TAU;
      u2 = u2 - floor(u2);
      float tPos = u2 * TENDRILS;
      float tID = floor(tPos);
      float tFrac = tPos - tID;
      float tKey = mod(tID, TENDRILS);
      float tCentered = (tFrac - 0.5) + snoise(vec3(tKey * 8.3 + seed, vYf * 3.0, 4.0)) * 0.18;
      float tPresent = step(0.45, hash11(tKey + 4.0));
      float tHw = 0.070 * mix(1.1, 0.28, vYf);
      float tBand = smoothstep(0.14, 0.42, vYf) * (1.0 - smoothstep(0.55, 0.88, vYf));
      float tendril = (1.0 - smoothstep(tHw - 0.03, tHw + 0.03, abs(tCentered))) * tPresent * tBand;

      float cover = max(strand, tendril * 0.9);
      if (cover < 0.03) discard;

      float roundc = 1.0 - clamp(ad / max(hw, 0.001), 0.0, 1.0);
      roundc = max(roundc, tendril);

      vec3 N = normalize(vNormal);
      float ndl = dot(N, KEY_DIR) * 0.5 + 0.5;

      float bark = snoise(vec3(centered * 9.0, vYf * 16.0 + sKey * 3.0, seed));
      float shade = ndl * 0.70 + 0.30;
      shade += bark * 0.14;
      shade *= mix(0.55, 1.0, roundc);
      shade = clamp(shade, 0.0, 1.0);

      if (bands >= 1.0) { shade = floor(shade * bands + 0.5) / bands; }
      shade = clamp(shade, 0.0, 1.0);

      vec3 col;
      if (shade < 0.5) { col = mix(edgeColor, midColor, shade * 2.0); }
      else { col = mix(midColor, coreColor, (shade - 0.5) * 2.0); }

      float leafCell = hash11(sKey * 7.0 + floor(vYf * 6.0) * 13.0 + seed);
      float leafTip = smoothstep(0.55, 0.95, vYf);
      float leafMask = step(0.80, leafCell) * leafTip * max(strand, tendril);
      leafMask = clamp(leafMask, 0.0, 1.0);
      vec3 leaf = coreColor * 1.30 + vec3(0.05, 0.12, 0.02);
      col = mix(col, leaf, leafMask * 0.70);
      col = mix(col, mix(col, leaf, 0.40), tendril * 0.50);

      vec3 V = normalize(cameraPosition - vWorldPos);
      float rim = pow(1.0 - max(dot(N, V), 0.0), rimPower);
      col += coreColor * rim * rimIntensity;

      col += col * emissive;
      col += leaf * emissive * leafMask * 1.5;

      gl_FragColor = vec4(col, cover * 0.9);
    }
  `;
}

export interface RootsMaterialParams {
  coreColor?: BABYLON.Color3;
  midColor?: BABYLON.Color3;
  edgeColor?: BABYLON.Color3;
  rimIntensity?: number;
  rimPower?: number;
  /** Cel-band count for the vine shade. 0 = smooth. Default 4. */
  bands?: number;
  emissive?: number;
  noiseScale?: number;
  /** Vertex rib-bulge + knot intensity (how far the ropes lift off the cone). Default 0.14. */
  displacement?: number;
  /** MUST equal loadShaderEffect's cone height / 2. Default 1.2. */
  halfHeight?: number;
  seed?: number;
}

export function createRootsMaterial(
  scene: BABYLON.Scene, name: string, params: RootsMaterialParams = {},
): BABYLON.ShaderMaterial {
  registerShaders();
  const mat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: 'rootsEffect', fragment: 'rootsEffect' },
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
  mat.setColor3('coreColor', params.coreColor ?? BABYLON.Color3.FromHexString('#7BE24F'));
  mat.setColor3('midColor', params.midColor ?? BABYLON.Color3.FromHexString('#44CC44'));
  mat.setColor3('edgeColor', params.edgeColor ?? BABYLON.Color3.FromHexString('#26401B'));
  mat.setFloat('rimIntensity', params.rimIntensity ?? 0.35);
  mat.setFloat('rimPower', params.rimPower ?? 3.0);
  mat.setFloat('bands', params.bands ?? 4);
  mat.setFloat('emissive', params.emissive ?? 0.16);
  mat.setFloat('noiseScale', params.noiseScale ?? 1.6);
  mat.setFloat('displacement', params.displacement ?? 0.14);
  mat.setFloat('halfHeight', params.halfHeight ?? 1.2);
  mat.setFloat('seed', params.seed ?? 7.0);
  mat.setFloat('time', 0);
  // A real 3D subject; cull back faces so the far shell of the cone doesn't overdraw the near shell
  // through the translucent blend.
  mat.backFaceCulling = true;
  mat.alpha = 1.0;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  return mat;
}
