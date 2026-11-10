import * as BABYLON from '@babylonjs/core';
import { createLightningMaterial, LightningMaterialParams } from '../effects/lightningMaterial';
import { createFireballMaterial, FireballMaterialParams } from '../effects/fireballMaterial';
import { createIceMaterial, IceMaterialParams } from '../effects/iceMaterial';
import { createFlameMaterial, FlameMaterialParams } from '../effects/flameMaterial';
import { createMiasmaMaterial, MiasmaMaterialParams } from '../effects/miasmaMaterial';
import { createFrostMaterial, FrostMaterialParams } from '../effects/frostMaterial';
import { createRootsMaterial, RootsMaterialParams } from '../effects/rootsMaterial';
import { createWetMaterial } from '../effects/wetMaterial';
import { createChargedMaterial } from '../effects/chargedMaterial';
import { createParalyzedMaterial } from '../effects/paralyzedMaterial';
import { createEvasionMaterial } from '../effects/evasionMaterial';
import { createStunnedMaterial } from '../effects/stunnedMaterial';
import { createSilencedMaterial } from '../effects/silencedMaterial';

/**
 * loadShaderEffect — the shader-subject sibling to `loadClip` (AutopilotRunner.tsx:110-241).
 * Returns the SAME shape (`root`/`animGroup`/`meshes`/`bounds`/`dispose`) `loadClip` does, so
 * `captureSphericalSheet`, `buildRigCameras`, and `computeFitRadius` need ZERO changes to
 * consume a procedural-shader subject instead of a rigged FBX character clip.
 *
 * The "clock" driver mirrors the crowd's own AnimationGroup.goToFrame() contract: a plain
 * TransformNode's position.x is keyframed 0->1 across `frames`, and an
 * onBeforeRenderObservable reads it back into the shader's `time` uniform. Babylon fires
 * onBeforeRenderObservable INSIDE scene.render(), before draw calls, so the value
 * captureSphericalSheet's scene.render() actually rasterizes is always the one goToFrame() just
 * set — identical timing guarantee to the crowd's bone-matrix case, just with a scalar instead
 * of a skeleton.
 */

export interface EffectSpec {
  /** Registry key — see EFFECT_REGISTRY below. */
  shader: string;
  /** Subject geometry. 'quad' (default) = a flat camera-facing billboard, correct for thin 2D
   *  effects like lightning where every azimuth cell should look the same. 'sphere' = a REAL 3D
   *  sphere that does NOT billboard, so the 8 rig cameras capture 8 genuinely different faces —
   *  required for volumetric effects (fireball/goop/healing) to read dimensionally across angles.
   *  'box' = a real rectangular prism (taller than wide) for a
   *  block-of-ice / crystal subject that overlays a model. 'cone' = a tall tapered cone (flame
   *  trunk) for a rising-flames subject that overlays a standing model (burning status). */
  geometry?: 'quad' | 'sphere' | 'box' | 'cone';
  /** Raw JSON params forwarded to the shader factory (colors as hex strings, numbers as-is). */
  params?: Record<string, unknown>;
}

export interface LoadedShaderEffect {
  root: BABYLON.TransformNode;
  animGroup: BABYLON.AnimationGroup;
  meshes: BABYLON.AbstractMesh[];
  bounds: { height: number; width: number; maxDimension: number };
  dispose: () => void;
}

function asColor3(v: unknown): BABYLON.Color3 | undefined {
  return typeof v === 'string' ? BABYLON.Color3.FromHexString(v) : undefined;
}
function asNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function toLightningParams(raw?: Record<string, unknown>): LightningMaterialParams {
  if (!raw) return {};
  return {
    coreColor: asColor3(raw.coreColor),
    glowColor: asColor3(raw.glowColor),
    rimIntensity: asNum(raw.rimIntensity),
    rimPower: asNum(raw.rimPower),
    bands: asNum(raw.bands),
    emissive: asNum(raw.emissive),
    noiseScale: asNum(raw.noiseScale),
    boltSeed: asNum(raw.boltSeed),
  };
}

function toFireballParams(raw?: Record<string, unknown>): FireballMaterialParams {
  if (!raw) return {};
  return {
    coreColor: asColor3(raw.coreColor),
    midColor: asColor3(raw.midColor),
    edgeColor: asColor3(raw.edgeColor),
    rimIntensity: asNum(raw.rimIntensity),
    rimPower: asNum(raw.rimPower),
    bands: asNum(raw.bands),
    emissive: asNum(raw.emissive),
    noiseScale: asNum(raw.noiseScale),
    displacement: asNum(raw.displacement),
    seed: asNum(raw.seed),
  };
}

function toIceParams(raw?: Record<string, unknown>): IceMaterialParams {
  if (!raw) return {};
  return {
    iceColor: asColor3(raw.iceColor),
    frostColor: asColor3(raw.frostColor),
    deepColor: asColor3(raw.deepColor),
    rimIntensity: asNum(raw.rimIntensity),
    rimPower: asNum(raw.rimPower),
    bands: asNum(raw.bands),
    crackIntensity: asNum(raw.crackIntensity),
    frostScale: asNum(raw.frostScale),
    seed: asNum(raw.seed),
  };
}

function toFlameParams(raw?: Record<string, unknown>): FlameMaterialParams {
  if (!raw) return {};
  return {
    coreColor: asColor3(raw.coreColor),
    midColor: asColor3(raw.midColor),
    edgeColor: asColor3(raw.edgeColor),
    rimIntensity: asNum(raw.rimIntensity),
    rimPower: asNum(raw.rimPower),
    bands: asNum(raw.bands),
    emissive: asNum(raw.emissive),
    noiseScale: asNum(raw.noiseScale),
    displacement: asNum(raw.displacement),
    flow: asNum(raw.flow),
    seed: asNum(raw.seed),
  };
}

function toMiasmaParams(raw?: Record<string, unknown>): MiasmaMaterialParams {
  if (!raw) return {};
  return {
    coreColor: asColor3(raw.coreColor),
    midColor: asColor3(raw.midColor),
    edgeColor: asColor3(raw.edgeColor),
    rimIntensity: asNum(raw.rimIntensity),
    rimPower: asNum(raw.rimPower),
    bands: asNum(raw.bands),
    emissive: asNum(raw.emissive),
    noiseScale: asNum(raw.noiseScale),
    displacement: asNum(raw.displacement),
    seed: asNum(raw.seed),
  };
}

function toFrostParams(raw?: Record<string, unknown>): FrostMaterialParams {
  if (!raw) return {};
  return {
    coreColor: asColor3(raw.coreColor),
    midColor: asColor3(raw.midColor),
    edgeColor: asColor3(raw.edgeColor),
    rimIntensity: asNum(raw.rimIntensity),
    rimPower: asNum(raw.rimPower),
    bands: asNum(raw.bands),
    emissive: asNum(raw.emissive),
    noiseScale: asNum(raw.noiseScale),
    displacement: asNum(raw.displacement),
    seed: asNum(raw.seed),
  };
}

function toRootsParams(raw?: Record<string, unknown>): RootsMaterialParams {
  if (!raw) return {};
  return {
    coreColor: asColor3(raw.coreColor),
    midColor: asColor3(raw.midColor),
    edgeColor: asColor3(raw.edgeColor),
    rimIntensity: asNum(raw.rimIntensity),
    rimPower: asNum(raw.rimPower),
    bands: asNum(raw.bands),
    emissive: asNum(raw.emissive),
    noiseScale: asNum(raw.noiseScale),
    displacement: asNum(raw.displacement),
    seed: asNum(raw.seed),
  };
}

/** The status-visual shells (wet/charged/paralyzed/evasion/stunned/silenced) all take the identical
 *  9 standard params, so they share one mapper instead of a bespoke to<X>Params each. */
function toStdParams(raw?: Record<string, unknown>) {
  if (!raw) return {};
  return {
    coreColor: asColor3(raw.coreColor),
    midColor: asColor3(raw.midColor),
    edgeColor: asColor3(raw.edgeColor),
    rimIntensity: asNum(raw.rimIntensity),
    rimPower: asNum(raw.rimPower),
    bands: asNum(raw.bands),
    emissive: asNum(raw.emissive),
    noiseScale: asNum(raw.noiseScale),
    displacement: asNum(raw.displacement),
    seed: asNum(raw.seed),
  };
}

type EffectFactory = (scene: BABYLON.Scene, name: string, params?: Record<string, unknown>) => BABYLON.ShaderMaterial;

/** In-memory shader registry keyed by `EffectSpec.shader` — the batch config's "shader" field
 *  looks itself up here. Adding a new effect (goop/healing/...) is one new entry. */
export const EFFECT_REGISTRY: Record<string, EffectFactory> = {
  lightning: (scene, name, params) => createLightningMaterial(scene, name, toLightningParams(params)),
  fireball: (scene, name, params) => createFireballMaterial(scene, name, toFireballParams(params)),
  ice: (scene, name, params) => createIceMaterial(scene, name, toIceParams(params)),
  flame: (scene, name, params) => createFlameMaterial(scene, name, toFlameParams(params)),
  miasma: (scene, name, params) => createMiasmaMaterial(scene, name, toMiasmaParams(params)),
  frost: (scene, name, params) => createFrostMaterial(scene, name, toFrostParams(params)),
  roots: (scene, name, params) => createRootsMaterial(scene, name, toRootsParams(params)),
  wet: (scene, name, params) => createWetMaterial(scene, name, toStdParams(params)),
  charged: (scene, name, params) => createChargedMaterial(scene, name, toStdParams(params)),
  paralyzed: (scene, name, params) => createParalyzedMaterial(scene, name, toStdParams(params)),
  evasion: (scene, name, params) => createEvasionMaterial(scene, name, toStdParams(params)),
  stunned: (scene, name, params) => createStunnedMaterial(scene, name, toStdParams(params)),
  silenced: (scene, name, params) => createSilencedMaterial(scene, name, toStdParams(params)),
};

/** World-size of the procedural subject (quad edge / sphere diameter). A fixed size is fine
 *  regardless of camera-rig framing: computeFitRadius (AutopilotRunner.tsx:19-29) solves for
 *  camera distance FROM this size so the subject fills `fit.fillFrac` of frame no matter what
 *  number is picked here — see bounds below. */
const QUAD_SIZE = 2;

/** Extra headroom on a displaced sphere's bounds so vertex displacement (fireballMaterial.ts
 *  pushes vertices out along their normals) never pokes past the framing computed from the base
 *  radius — otherwise the roiling silhouette would clip at the cell edge. */
const SPHERE_DISPLACE_PAD = 1.2;

/** Ice-block box dimensions (world units) — taller than wide/deep so it frames as an upright
 *  block that can encase a standing character when billboarded over one in-game. */
const BOX_W = 1.15;
const BOX_H = 1.5;
const BOX_D = 1.15;

/** Flame cone: tall + tapered so it images as a rising flame column that overlays a standing
 *  model. FLAME_H / 2 MUST equal flameMaterial's `halfHeight` default (the base->tip gradient). */
const FLAME_H = 2.4;
const FLAME_D = 1.5;

export async function loadShaderEffect(scene: BABYLON.Scene, spec: EffectSpec, frames: number): Promise<LoadedShaderEffect> {
  const factory = EFFECT_REGISTRY[spec.shader];
  if (!factory) throw new Error(`loadShaderEffect: unknown shader "${spec.shader}" (known: ${Object.keys(EFFECT_REGISTRY).join(', ')})`);

  const geometry = spec.geometry ?? 'quad';
  const root = new BABYLON.TransformNode('effectRoot', scene);

  let mesh: BABYLON.Mesh;
  let bounds: LoadedShaderEffect['bounds'];
  if (geometry === 'sphere') {
    // A REAL 3D subject: a fixed (non-billboarded) sphere the rig's 8 azimuth cameras see from 8
    // different sides. High segment count so snoise vertex displacement stays smooth. Bounds are
    // padded for the displacement so the roiling silhouette never clips the cell.
    mesh = BABYLON.MeshBuilder.CreateSphere('effectSphere', { diameter: QUAD_SIZE, segments: 64 }, scene);
    mesh.parent = root;
    const padded = QUAD_SIZE * SPHERE_DISPLACE_PAD;
    bounds = { height: padded, width: padded, maxDimension: padded };
  } else if (geometry === 'box') {
    // A REAL 3D rectangular prism, taller than wide, to encase an upright model (ice block).
    // Non-billboarded so the 8 azimuth cameras see its faces/edges rotate. maxDimension = the
    // tallest axis, which computeFitRadius frames the cell against.
    mesh = BABYLON.MeshBuilder.CreateBox('effectBox', { width: BOX_W, height: BOX_H, depth: BOX_D }, scene);
    mesh.parent = root;
    // Frame by the SPACE DIAGONAL, not the longest edge: a box viewed corner-on projects wider
    // than any single edge, so fitting to max(edge) clips it at the 45deg cells. The diagonal is
    // the box's worst-case projected extent -> contained from every azimuth.
    const diag = Math.sqrt(BOX_W * BOX_W + BOX_H * BOX_H + BOX_D * BOX_D);
    bounds = { height: diag, width: diag, maxDimension: diag };
  } else if (geometry === 'cone') {
    // A tall tapered cone (flame trunk), the `burning` subject. Non-billboarded so the rig images
    // its licking silhouette across angles; the flame carve + upward flow live in the shader. High
    // tessellation/subdivisions so the vertex displacement stays smooth. Frame by the height (the
    // dominant extent) with displacement headroom so the roiling tongues never clip the cell.
    mesh = BABYLON.MeshBuilder.CreateCylinder('effectFlame', {
      height: FLAME_H, diameterTop: 0.05, diameterBottom: FLAME_D, tessellation: 48, subdivisions: 40,
    }, scene);
    mesh.parent = root;
    const pad = FLAME_H * 1.18;
    bounds = { height: pad, width: FLAME_D * 1.18, maxDimension: pad };
  } else {
    mesh = BABYLON.MeshBuilder.CreatePlane('effectQuad', { size: QUAD_SIZE }, scene);
    mesh.parent = root;
    // Always face whichever camera is currently rendering. renderFrameViaLiveFeed
    // (frameRenderer.ts) repositions liveFeedCamera to each rig camera in turn and sets it as the
    // scene's sole active camera before each scene.render() — billboarding orients this mesh to
    // face THAT camera on that render, so every one of the 8 captured azimuth cells sees a
    // correctly front-on 2D bolt (see lightningMaterial.ts's module doc for why this sidesteps
    // 3D-mesh-rotation calibration risk for a flat subject).
    mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    // Static bounds — a fixed-size flat quad, not a posed/displaced silhouette.
    bounds = { height: QUAD_SIZE, width: QUAD_SIZE, maxDimension: QUAD_SIZE };
  }

  const material = factory(scene, `${spec.shader}Material`, spec.params);
  mesh.material = material;

  const clock = new BABYLON.TransformNode('effectClock', scene);
  const anim = new BABYLON.Animation('effectClockAnim', 'position.x', frames, BABYLON.Animation.ANIMATIONTYPE_FLOAT);
  anim.setKeys([{ frame: 0, value: 0 }, { frame: frames, value: 1 }]);
  clock.animations = [anim];
  const animGroup = new BABYLON.AnimationGroup('effectClockGroup', scene);
  animGroup.addTargetedAnimation(anim, clock);

  const observer = scene.onBeforeRenderObservable.add(() => {
    material.setFloat('time', clock.position.x);
  });

  return {
    root,
    animGroup,
    meshes: [mesh],
    bounds,
    dispose: () => {
      scene.onBeforeRenderObservable.remove(observer);
      animGroup.dispose();
      clock.dispose();
      mesh.dispose(false, true);
      root.dispose();
    },
  };
}
